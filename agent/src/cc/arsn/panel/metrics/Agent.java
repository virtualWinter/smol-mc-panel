package cc.arsn.panel.metrics;

import java.io.File;
import java.lang.instrument.ClassFileTransformer;
import java.lang.instrument.Instrumentation;
import java.security.ProtectionDomain;
import java.util.jar.JarFile;
import org.objectweb.asm.ClassReader;
import org.objectweb.asm.ClassVisitor;
import org.objectweb.asm.ClassWriter;
import org.objectweb.asm.MethodVisitor;
import org.objectweb.asm.Opcodes;

/** Internal panel instrumentation, not a Bukkit/Velocity/Bungee plugin. */
public final class Agent {
    private static JarFile bootstrap;

    public static void premain(String options, Instrumentation instrumentation) throws Exception {
        File directory = new File(Agent.class.getProtectionDomain().getCodeSource().getLocation().toURI()).getParentFile();
        bootstrap = new JarFile(new File(directory, "metrics-bridge.jar"));
        instrumentation.appendToBootstrapClassLoaderSearch(bootstrap);
        Class<?> bridge = Class.forName("cc.arsn.panel.metrics.Bridge", true, null);
        bridge.getMethod("configure", String.class, Instrumentation.class).invoke(null, options, instrumentation);
        instrumentation.addTransformer(new Hooks(), false);
    }

    private static final class Hooks implements ClassFileTransformer {
        @Override
        public byte[] transform(ClassLoader loader, String name, Class<?> redefined,
                                ProtectionDomain domain, byte[] bytes) {
            boolean paper = "net/minecraft/server/MinecraftServer".equals(name);
            boolean proxy = "com/velocitypowered/proxy/VelocityServer".equals(name)
                    || "net/md_5/bungee/BungeeCord".equals(name);
            boolean framesIn = "com/velocitypowered/proxy/protocol/netty/MinecraftVarintFrameDecoder".equals(name)
                    || "net/md_5/bungee/netty/Varint21FrameDecoder".equals(name);
            boolean framesOut = "com/velocitypowered/proxy/protocol/netty/MinecraftVarintLengthEncoder".equals(name)
                    || "com/velocitypowered/proxy/protocol/netty/MinecraftCompressorAndLengthEncoder".equals(name)
                    || "net/md_5/bungee/netty/PacketEncoder".equals(name);
            if (!paper && !proxy && !framesIn && !framesOut) return null;
            try {
                ClassReader reader = new ClassReader(bytes);
                ClassWriter writer = new ClassWriter(reader, 0);
                boolean[] changed = {false};
                reader.accept(new ClassVisitor(Opcodes.ASM9, writer) {
                    @Override
                    public MethodVisitor visitMethod(int access, String method, String descriptor,
                                                     String signature, String[] exceptions) {
                        MethodVisitor original = super.visitMethod(access, method, descriptor, signature, exceptions);
                        boolean tick = paper && "tickServer".equals(method)
                                && "(Ljava/util/function/BooleanSupplier;)V".equals(descriptor);
                        boolean constructor = proxy && "<init>".equals(method);
                        boolean decode = framesIn && "decode".equals(method)
                                && "(Lio/netty/channel/ChannelHandlerContext;Lio/netty/buffer/ByteBuf;Ljava/util/List;)V".equals(descriptor);
                        boolean encode = framesOut && "encode".equals(method)
                                && ("(Lio/netty/channel/ChannelHandlerContext;Lio/netty/buffer/ByteBuf;Ljava/util/List;)V".equals(descriptor)
                                    || "(Lio/netty/channel/ChannelHandlerContext;Lio/netty/buffer/ByteBuf;Lio/netty/buffer/ByteBuf;)V".equals(descriptor));
                        if (!tick && !constructor && !decode && !encode) return original;
                        changed[0] = true;
                        return new MethodVisitor(Opcodes.ASM9, original) {
                            @Override
                            public void visitCode() {
                                super.visitCode();
                                if (encode) {
                                    super.visitVarInsn(Opcodes.ALOAD, 2);
                                    super.visitMethodInsn(Opcodes.INVOKESTATIC, "cc/arsn/panel/metrics/Bridge",
                                            "outboundFrame", "(Ljava/lang/Object;)V", false);
                                }
                            }

                            @Override
                            public void visitInsn(int opcode) {
                                if (opcode == Opcodes.RETURN) {
                                    if (constructor) super.visitVarInsn(Opcodes.ALOAD, 0);
                                    if (decode) {
                                        super.visitVarInsn(Opcodes.ALOAD, 3);
                                        super.visitMethodInsn(Opcodes.INVOKESTATIC, "cc/arsn/panel/metrics/Bridge",
                                                "inboundFrames", "(Ljava/util/List;)V", false);
                                    } else if (tick || constructor) {
                                        super.visitMethodInsn(Opcodes.INVOKESTATIC, "cc/arsn/panel/metrics/Bridge",
                                                tick ? "tick" : "bindProxy", tick ? "()V" : "(Ljava/lang/Object;)V", false);
                                    }
                                }
                                super.visitInsn(opcode);
                            }
                            @Override
                            public void visitMaxs(int stack, int locals) {
                                super.visitMaxs(Math.max(stack, 1), locals);
                            }
                        };
                    }
                }, 0);
                return changed[0] ? writer.toByteArray() : null;
            } catch (Throwable ignored) {
                // Never prevent the game server loading if its internals change.
                return null;
            }
        }
    }
}
